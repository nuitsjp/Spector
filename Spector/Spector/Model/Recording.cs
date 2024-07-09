using System.Collections.Concurrent;
using System.IO;
using NAudio.Utils;
using NAudio.Wave;

namespace Spector.Model;

public class Recording
{
    internal Recording(
        DirectoryInfo recordRootDirectory, 
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        // ReSharper disable once StringLiteralTypo
        CurrentRecordDirectory =
            new DirectoryInfo(Path.Combine(recordRootDirectory.FullName, DateTime.Now.ToString("yyyyMMdd-HHmmss")))
                .CreateIfNotExists();
        Direction = direction;
        WithVoice = withVoice;
        WithBuzz = withBuzz;
        RecorderByDevices = devices
            .Select(x => new RecordingByDevice(x, CurrentRecordDirectory, CancellationTokenSource.Token))
            .ToArray();
    }

    private DirectoryInfo CurrentRecordDirectory { get; }
    private Direction Direction { get; }
    private bool WithVoice { get; }
    private bool WithBuzz { get; }
    private CancellationTokenSource CancellationTokenSource { get; } = new();

    /// <summary>
    /// 録音中のデバイス
    /// </summary>
    private IReadOnlyList<RecordingByDevice> RecorderByDevices { get; }

    private DateTime StartTime { get; set; }

    internal void StartRecording()
    {
        StartTime = DateTime.Now;
        foreach (var device in RecorderByDevices)
        {
            device.StartRecording();
        }

        Task.Run(() =>
            {
                foreach (var device in RecorderByDevices)
                {
                    device.MarkLevel();
                }
            },
            CancellationTokenSource.Token);
    }

    public Record StopRecording()
    {
        CancellationTokenSource.Cancel();
        return new Record(
            Direction,
            WithVoice,
            WithBuzz,
            StartTime,
            DateTime.Now, 
            RecorderByDevices.Select(x => x.ToRecord()).ToArray());
    }

    private class RecordingByDevice(
        IDevice device, 
        DirectoryInfo directory,
        CancellationToken cancellationToken) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];

        private WaveFileWriter? Writer { get; set; }

        private List<Decibel> Decibels { get; } = [];


        public void StartRecording()
        {
            cancellationToken.Register(StopRecording);

            Writer = new WaveFileWriter(GetRecordFileInfo().FullName, device.WaveFormat);

            device.DataAvailable += (_, e) =>
            {
                byte[] buffer = new byte[e.BytesRecorded];
                Array.Copy(e.Buffer, buffer, e.BytesRecorded);

                if (cancellationToken.IsCancellationRequested) return;

                try
                {
                    BufferQueue.Add(buffer);
                }
                catch
                {
                    // すれ違いでStopRecordingが呼ばれた場合、例外が発生するが無視する
                }
            };

            Task.Run(ProcessQueue);
        }

        public void MarkLevel()
        {
            Decibels.Add(device.Level);
        }

        private void StopRecording()
        {
            BufferQueue.CompleteAdding();
        }

        private void ProcessQueue()
        {
            try
            {
                foreach (var buffer in BufferQueue.GetConsumingEnumerable())
                {
                    // データの処理
                    Writer?.Write(buffer, 0, buffer.Length);
                }
            }
            finally
            {
                Writer?.Flush();
                Writer?.Dispose();
            }
        }

        public RecordByDevice ToRecord()
        {
            return new RecordByDevice(
                device.Id,
                device.Name,
                device.SystemName,
                Decibels.Min(),
                new Decibel(Decibels.Average(x => x.AsPrimitive())),
                Decibels.Max(),
                (double)Decibels.Count(x => -30d < x.AsPrimitive()) / Decibels.Count,
                (double)Decibels.Count(x => -40d < x.AsPrimitive()) / Decibels.Count,
                (double)Decibels.Count(x => -50d < x.AsPrimitive()) / Decibels.Count);
        }

        public void Dispose()
        {
        }

        private FileInfo GetRecordFileInfo()
        {
            // ファイル名に利用できない文字を取得
            var invalidChars = Path.GetInvalidFileNameChars();

            var fileName = device.Name + ".wav";
            // ファイル名の無効な文字をアンダースコアに置き換える
            fileName = invalidChars
                .Aggregate(fileName, (current, c) => current.Replace(c, '_'));

            return new FileInfo(Path.Combine(directory.FullName, fileName));
        }
    }
}

public record Record(
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordByDevice> RecordByDevices);

public record RecordByDevice(
    DeviceId Id,
    string Name,
    string SystemName,
    Decibel Min,
    Decibel Avg,
    Decibel Max,
    double Minus30db,
    double Minus40db,
    double Minus50db);