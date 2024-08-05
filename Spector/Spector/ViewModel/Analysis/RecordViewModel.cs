using Spector.Model;

namespace Spector.ViewModel.Analysis;

public record RecordViewModel(
    Record Record,
    DeviceId MeasureDeviceId,
    string DeviceName,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordProcessViewModel> RecordProcesses);