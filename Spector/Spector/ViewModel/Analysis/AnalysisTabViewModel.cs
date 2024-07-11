using System.Reactive.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel.Analysis;

public partial class AnalysisTabViewModel : ObservableObject, IDisposable
{
    public AnalysisTabViewModel(
        ISettingsRepository settingsRepository,
        Recorder recorder)
    {
        recorder.Records.ToCollectionChanged()
            .Select(_ => Observable.FromAsync(async () =>
            {
                var settings = await settingsRepository.LoadAsync();
                return recorder.Records
                    .Select(record => new RecordViewModel(
                        record.MeasureDeviceId,
                        settings.Devices.SingleOrDefault(x => x.Id == record.MeasureDeviceId)?.Name ?? record.MeasureDeviceId.ToString(),
                        record.Direction,
                        record.WithVoice,
                        record.WithBuzz,
                        record.StartTime,
                        record.StopTime,
                        record.RecordByDevices
                            .Select(recordByDevice => new RecordViewModel.RecordByDeviceViewModel(
                                recordByDevice.Id,
                                recordByDevice.Name,
                                recordByDevice.SystemName,
                                recordByDevice.Min,
                                recordByDevice.Avg,
                                recordByDevice.Max,
                                recordByDevice.Minus30db,
                                recordByDevice.Minus40db,
                                recordByDevice.Minus50db))
                            .ToArray()))
                    .ToArray();
            }))
            .Concat()
            .Subscribe(records =>
            {
                Records = records;
            });
        this.ObserveProperty(x => x.SelectedRecord)
            .Subscribe(x => Devices = x?.RecordByDevices ?? [])
            .AddTo(CompositeDisposable);
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    [ObservableProperty] private IReadOnlyCollection<RecordViewModel> _records = [];

    [ObservableProperty] private RecordViewModel? _selectedRecord;

    [ObservableProperty] private IReadOnlyCollection<RecordViewModel.RecordByDeviceViewModel> _devices = [];
    [ObservableProperty] private RecordViewModel.RecordByDeviceViewModel? _selectedDevice;

    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}

public record RecordViewModel(
    DeviceId MeasureDeviceId,
    string DeviceName,
    Direction Direction,
    bool WithVoice,
    bool WithBuzz,
    DateTime StartTime,
    DateTime StopTime,
    IReadOnlyList<RecordViewModel.RecordByDeviceViewModel> RecordByDevices)
{
    public record RecordByDeviceViewModel(
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
