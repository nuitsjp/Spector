using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using NAudio.Wave;

namespace Spector.Model;

public class Recording
{
    internal Recording(
        DirectoryInfo rootDirectory, 
        DeviceId measureDeviceId, 
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        RootDirectory = rootDirectory;
        Direction = direction;
        WithVoice = withVoice;
        WithBuzz = withBuzz;
        Devices = devices.ToArray();
        MeasureDeviceId = measureDeviceId;
    }

    private DirectoryInfo RootDirectory { get; }
    private DirectoryInfo CurrentRecordDirectory { get; set; } = default!;
    private DeviceId MeasureDeviceId { get; }
    private Direction Direction { get; }
    private bool WithVoice { get; }
    private bool WithBuzz { get; }
    private IReadOnlyList<IDevice> Devices { get; }

    /// <summary>
    /// 録音中のデバイス
    /// </summary>
    private IReadOnlyList<RecordingByDevice> RecorderByDevices { get; set; } = [];

    private DateTime StartTime { get; set; }

    internal void StartRecording()
    {
        StartTime = DateTime.Now;
        // ReSharper disable once StringLiteralTypo
        CurrentRecordDirectory =
            new DirectoryInfo(Path.Combine(RootDirectory.FullName, Record.ToDirectoryName(StartTime)))
                .CreateIfNotExists();
        RecorderByDevices = Devices
            .Select(x => new RecordingByDevice(x, CurrentRecordDirectory))
            .ToArray();
        foreach (var device in RecorderByDevices)
        {
            device.StartRecording();
        }
    }

    public Record StopRecording()
    {
        foreach (var device in RecorderByDevices)
        {
            device.StopRecording();
        }
        var record = new Record(
            MeasureDeviceId,
            Direction,
            WithVoice,
            WithBuzz,
            StartTime,
            DateTime.Now, 
            RecorderByDevices
                .Select(x => x.ToRecord()).ToArray());

        using var stream = new FileStream(Path.Combine(CurrentRecordDirectory.FullName, "record.json"), FileMode.Create);
        // JSON形式で保存
        JsonSerializer.Serialize(stream, record, JsonEnvironments.Options);

        return record;
    }

    private class RecordingByDevice(IDevice device, DirectoryInfo directory) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];

        private WaveFileWriter? Writer { get; set; }

        private string FilePath => Path.Combine(directory.FullName, Record.RecordByDevice.ToFileName(device.Name));

        private bool IsStopped { get; set; } = true;

        public void StartRecording()
        {
            IsStopped = false;

            Writer = new WaveFileWriter(FilePath, device.WaveFormat);

            device.DataAvailable += (_, e) =>
            {
                var buffer = new byte[e.BytesRecorded];
                Array.Copy(e.Buffer, buffer, e.BytesRecorded);

                if (IsStopped) return;

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

        public void StopRecording()
        {
            IsStopped = true;
            BufferQueue.CompleteAdding();

            Writer?.Flush();
            Writer?.Dispose();
        }

        private void ProcessQueue()
        {
            foreach (var buffer in BufferQueue.GetConsumingEnumerable())
            {
                if (IsStopped) break;

                // データの処理
                Writer?.Write(buffer, 0, buffer.Length);
            }
        }

        public Record.RecordByDevice ToRecord()
        {
            var levels = WaveFileAnalyzer.Analyze(FilePath).ToArray();
            return levels.Any()
                ? new Record.RecordByDevice(
                    device.Id,
                    device.Name,
                    device.SystemName,
                    levels.Min(),
                    new Decibel(levels.Average(x => x.AsPrimitive())),
                    levels.Max(),
                    (double)levels.Count(x => -30d < x.AsPrimitive()) / levels.Length,
                    (double)levels.Count(x => -40d < x.AsPrimitive()) / levels.Length,
                    (double)levels.Count(x => -50d < x.AsPrimitive()) / levels.Length)
                : new Record.RecordByDevice(
                    device.Id,
                    device.Name,
                    device.SystemName,
                    Decibel.Minimum,
                    Decibel.Minimum,
                    Decibel.Minimum,
                    0,
                    0,
                    0);
        }

        public void Dispose()
        {
        }
    }
}