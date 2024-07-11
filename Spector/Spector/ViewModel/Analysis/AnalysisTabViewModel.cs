using System.ComponentModel;
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
        base.PropertyChanging += OnPropertyChanging;
        PropertyChanged += OnPropertyChanged;

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
                            .Select(recordByDevice => new RecordByDeviceViewModel(
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

    private void OnPropertyChanging(object? sender, PropertyChangingEventArgs e)
    {
        if (e.PropertyName != nameof(Records)) return;

        foreach (var record in Records)
        {
            foreach (var device in record.RecordByDevices)
            {
                device.PropertyChanged -= DeviceOnPropertyChanged;
            }
        }
    }

    private void OnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(Records)) return;

        foreach (var record in Records)
        {
            foreach (var device in record.RecordByDevices)
            {
                device.PropertyChanged += DeviceOnPropertyChanged;
            }
        }
    }

    private void DeviceOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    [ObservableProperty] private IReadOnlyCollection<RecordViewModel> _records = [];

    [ObservableProperty] private RecordViewModel? _selectedRecord;

    [ObservableProperty] private IReadOnlyCollection<RecordByDeviceViewModel> _devices = [];
    [ObservableProperty] private RecordByDeviceViewModel? _selectedDevice;

    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}