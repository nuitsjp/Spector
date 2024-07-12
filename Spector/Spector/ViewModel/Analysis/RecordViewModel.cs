using Spector.Model;

namespace Spector.ViewModel.Analysis;

public record RecordViewModel(
    Record Record,
    DeviceId MeasureDeviceId,
    string DeviceName,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordByDeviceViewModel> RecordByDevices)
{
}