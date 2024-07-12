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
    private CancellationTokenSource CancellationTokenSource { get; } = new();

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
            .Select(x => new RecordingByDevice(x, CurrentRecordDirectory, CancellationTokenSource.Token))
            .ToArray();
        foreach (var device in RecorderByDevices)
        {
            device.StartRecording();
        }
    }

    public Record StopRecording()
    {
        CancellationTokenSource.Cancel();
        var record = new Record(
            MeasureDeviceId,
            Direction,
            WithVoice,
            WithBuzz,
            StartTime,
            DateTime.Now, 
            RecorderByDevices.Select(x => x.ToRecord()).ToArray());

        using var stream = new FileStream(Path.Combine(CurrentRecordDirectory.FullName, "record.json"), FileMode.Create);
        // JSON形式で保存
        JsonSerializer.Serialize(stream, record, JsonEnvironments.Options);

        return record;
    }

    private class RecordingByDevice(
        IDevice device, 
        DirectoryInfo directory,
        CancellationToken cancellationToken) : IDisposable
    {
        private BlockingCollection<byte[]> BufferQueue { get; } = [];

        private WaveFileWriter? Writer { get; set; }

        public void StartRecording()
        {
            cancellationToken.Register(StopRecording);

            Writer = new WaveFileWriter(Path.Combine(directory.FullName, Record.RecordByDevice.ToFileName(device.Name)), device.WaveFormat);

            device.DataAvailable += (_, e) =>
            {
                var buffer = new byte[e.BytesRecorded];
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

        public Record.RecordByDevice ToRecord()
        {
            return new Record.RecordByDevice(
                device.Id,
                device.Name,
                device.SystemName,
                device.Levels.Min(),
                new Decibel(device.Levels.Average(x => x.AsPrimitive())),
                device.Levels.Max(),
                (double)device.Levels.Count(x => -30d < x.AsPrimitive()) / device.Levels.Count,
                (double)device.Levels.Count(x => -40d < x.AsPrimitive()) / device.Levels.Count,
                (double)device.Levels.Count(x => -50d < x.AsPrimitive()) / device.Levels.Count);
        }

        public void Dispose()
        {
        }
    }
}