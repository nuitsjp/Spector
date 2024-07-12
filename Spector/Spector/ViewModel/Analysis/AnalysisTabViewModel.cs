using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Reactive.Linq;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.Wave;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Spector.Model;

namespace Spector.ViewModel.Analysis;

public partial class AnalysisTabViewModel : ObservableObject, IDisposable
{
    public AnalysisTabViewModel(
        Recorder recorder)
    {
        Recorder = recorder;
        base.PropertyChanging += OnPropertyChanging;
        PropertyChanged += OnPropertyChanged;

        UpdateRecords();
        recorder.Records.ToCollectionChanged()
            .Subscribe(_ => UpdateRecords())
            .AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.SelectedRecord)
            .Subscribe(x => Devices = x?.RecordByDevices ?? [])
            .AddTo(CompositeDisposable);
    }

    private CompositeDisposable CompositeDisposable { get; } = new();
    private Recorder Recorder { get; }
    [ObservableProperty] private IReadOnlyCollection<RecordViewModel> _records = [];

    [ObservableProperty] private RecordViewModel? _selectedRecord;

    [ObservableProperty] private IReadOnlyCollection<RecordByDeviceViewModel> _devices = [];
    [ObservableProperty] private RecordByDeviceViewModel? _selectedDevice;

    public ObservableCollection<AnalysisDeviceViewModel> AnalysisDevices { get; } = [];

    private void UpdateRecords()
    {
        Records = Recorder.Records
            .Select(record =>
            {
                return new RecordViewModel(
                    record,
                    record.MeasureDeviceId,
                    record.RecordByDevices.SingleOrDefault(x => x.Id == record.MeasureDeviceId)?.Name ??
                    record.MeasureDeviceId.ToString(),
                    record.Direction,
                    record.WithVoice,
                    record.WithBuzz,
                    record.StartTime,
                    record.StopTime,
                    record.RecordByDevices
                        .Select(recordByDevice => new RecordByDeviceViewModel(
                            recordByDevice,
                            recordByDevice.Id,
                            recordByDevice.Name,
                            recordByDevice.SystemName,
                            recordByDevice.Min,
                            recordByDevice.Avg,
                            recordByDevice.Max,
                            recordByDevice.Minus30db,
                            recordByDevice.Minus40db,
                            recordByDevice.Minus50db))
                        .ToArray());
            })
            .ToArray();
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

    private async void DeviceOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName != nameof(RecordByDeviceViewModel.IsAnalysis)) return;

        var device = (RecordByDeviceViewModel)sender!;
        if (device.IsAnalysis)
        {
            var inputLevels = Recorder.AnalyzeWaveFile(SelectedRecord!.Record, device.Device);
            // IsAnalysisがtrueになった場合、外套のDeviceが存在するRecordは必ずSelectedRecordになっている
            AnalysisDevices.Add(
                new AnalysisDeviceViewModel(
                    SelectedRecord!, 
                    device, 
                    inputLevels));
        }
        else
        {
            AnalysisDevices.Remove(AnalysisDevices.Single(x => x.DeviceRecord == device));
        }
    }


    public void Dispose()
    {
        CompositeDisposable.Dispose();
    }
}