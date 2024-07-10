using CommunityToolkit.Mvvm.ComponentModel;
using Reactive.Bindings;
using Spector.Model;

namespace Spector.ViewModel.Analysis;

public partial class AnalysisTabViewModel(Recorder recorder) : ObservableObject
{
    public ReadOnlyReactiveCollection<Record> Records { get; } = recorder.Records.ToReadOnlyReactiveCollection();

    [ObservableProperty] private Record? _selectedRecord;


}