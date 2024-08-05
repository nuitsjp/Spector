using System.IO;
using System.Text.Json;

namespace Spector.Model;

public class Recording
{
    internal Recording(
        DirectoryInfo rootDirectory, 
        DeviceId measureDeviceId, 
        IEnumerable<IDevice> devices, 
        IEnumerable<RecordingProcess> recordingProcesses,
        IDevice playbackDevice)
    {
        RootDirectory = rootDirectory;
        PlaybackDevice = playbackDevice;
        Devices = devices.ToArray();
        RecordingProcesses = recordingProcesses.ToArray();
        MeasureDeviceId = measureDeviceId;
    }

    private DirectoryInfo RootDirectory { get; }
    private DirectoryInfo CurrentRecordDirectory { get; set; } = default!;
    private DeviceId MeasureDeviceId { get; }
    private IReadOnlyList<IDevice> Devices { get; }
    private IReadOnlyList<RecordingProcess> RecordingProcesses { get; }
    private IDevice PlaybackDevice { get; }

    /// <summary>
    /// 録音中のデバイス
    /// </summary>
    private List<(RecordingProcess Process, IReadOnlyList<RecordingByDevice> Devices)> RecorderByDevices { get; } = [];

    private DateTime StartTime { get; set; }

    internal void StartRecording()
    {
        foreach (var recordingProcess in RecordingProcesses)
        {
            StartTime = DateTime.Now;
            // ReSharper disable once StringLiteralTypo
            CurrentRecordDirectory =
                new DirectoryInfo(Path.Combine(RootDirectory.FullName, Record.ToDirectoryName(StartTime)))
                    .CreateIfNotExists();

            var devices = Devices
                .Select(x => 
                    new RecordingByDevice(
                        x, 
                        CurrentRecordDirectory))
                .ToArray();
            RecorderByDevices.Add((recordingProcess, devices));
            foreach (var device in devices)
            {
                device.StartRecording();
            }
        }
    }
    
    public Record StopRecording()
    {
        foreach (var device in RecorderByDevices.SelectMany(x => x.Devices))
        {
            device.StopRecording();
        }
        var record = new Record(
            MeasureDeviceId,
            StartTime,
            DateTime.Now, 
            RecorderByDevices
                .Select(x => x.Process.ToRecordProcess(x.Devices)).ToArray());

        using var stream = new FileStream(Path.Combine(CurrentRecordDirectory.FullName, "record.json"), FileMode.Create);
        // JSON形式で保存
        JsonSerializer.Serialize(stream, record, JsonEnvironments.Options);

        return record;
    }
}