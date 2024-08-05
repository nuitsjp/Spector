using Spector.Model;

namespace Spector.ViewModel.Analysis;

public record RecordProcessViewModel(
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    VolumeLevel VolumeLevel,
    IReadOnlyList<RecordByDeviceViewModel> RecordByDevices);