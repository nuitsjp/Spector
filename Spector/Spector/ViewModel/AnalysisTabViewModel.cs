using CommunityToolkit.Mvvm.ComponentModel;
using Reactive.Bindings;
using Spector.Model;

namespace Spector.ViewModel;

public partial class AnalysisTabViewModel(Recorder recorder) : ObservableObject
{
    public ReadOnlyReactiveCollection<Record> Records { get; } = recorder.Records.ToReadOnlyReactiveCollection();

    [ObservableProperty] private Record? _selectedRecord;


}