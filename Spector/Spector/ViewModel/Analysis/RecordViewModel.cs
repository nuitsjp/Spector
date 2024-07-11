using Spector.Model;

namespace Spector.ViewModel.Analysis;

public record RecordViewModel(
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