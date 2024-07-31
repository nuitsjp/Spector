using System.IO;
using System.Text.Json;

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
}