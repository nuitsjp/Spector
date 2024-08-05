namespace Spector.Model;

public record Record(
    DeviceId MeasureDeviceId,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordProcess> RecordProcesses)
{
    public string DirectoryName => ToDirectoryName(StartTime);

    public static string ToDirectoryName(DateTime dateTime) => dateTime.ToString("yyyy-MM-dd_HH-mm-ss");
}

public record RecordProcess(
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    VolumeLevel VolumeLevel,
    IReadOnlyList<RecordByDevice> RecordByDevices);