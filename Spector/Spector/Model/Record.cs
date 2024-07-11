namespace Spector.Model;

public record Record(
    DeviceId MeasureDeviceId,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordByDevice> RecordByDevices);