namespace Spector.Model;

public record Record(
    DeviceId MeasureDeviceId,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordByDevice> RecordByDevices)
{
    public string DirectoryName => ToDirectoryName(StartTime);

    public static string ToDirectoryName(DateTime dateTime) => dateTime.ToString("yyyy-MM-dd_HH-mm-ss");
}