using CommunityToolkit.Mvvm.ComponentModel;
using Spector.Model;

namespace Spector.ViewModel;

public partial class RecorderViewModel(AudioInterface audioInterface) : ObservableObject
{
    public IReadOnlyCollection<Direction> Directions { get; } = Enum.GetValues<Direction>();
    public Direction SelectedDirection { get; set; } = Direction.Front;

    [ObservableProperty] private bool _withVoice;
    [ObservableProperty] private bool _withBuzz;

    private AudioInterface AudioInterface { get; } = audioInterface;
}