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
    private IReadOnlyList<RecordingByDevice> RecorderByDevices { get; set; } = [];

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
            RecorderByDevices = Devices
                .Select(x => 
                    new RecordingByDevice(
                        x, 
                        recordingProcess.Direction,
                        recordingProcess.WithVoice,
                        recordingProcess.WithBuzz,
                        x.VolumeLevel,
                        CurrentRecordDirectory))
                .ToArray();
            foreach (var device in RecorderByDevices)
            {
                device.StartRecording();
            }
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