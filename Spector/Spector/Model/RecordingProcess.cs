using CommunityToolkit.Mvvm.ComponentModel;

namespace Spector.Model;

public partial class RecordingProcess(
    Direction direction,
    bool withVoice,
    bool withBuzz,
    VolumeLevel volumeLevel) : ObservableBase
{
    public Direction Direction { get; } = direction;
    public bool WithVoice { get; } = withVoice;
    public bool WithBuzz { get; } = withBuzz;
    public VolumeLevel VolumeLevel { get; } = volumeLevel;
    [ObservableProperty] private RecordingState _state = RecordingState.Stopped;

    public RecordProcess ToRecordProcess(IEnumerable<RecordingByDevice> devices) => 
        new(Direction, WithVoice, WithBuzz, VolumeLevel, devices.Select(x => x.ToRecord()).ToArray());
}