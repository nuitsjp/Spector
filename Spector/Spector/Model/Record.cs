namespace Spector.Model;

public record Record(
    DeviceId MeasureDeviceId,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<Record.RecordByDevice> RecordByDevices)
{
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
}