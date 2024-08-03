using System.Collections.ObjectModel;
using System.ComponentModel;
using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using Reactive.Bindings.Extensions;
using Reactive.Bindings.Helpers;
using Spector.Model;
using Spector.ViewModel.Measure;
using Recorder = Spector.Model.Recorder;

namespace Spector.ViewModel.Calibration;

public partial class CalibrationTabViewModel(
    AudioInterfaceViewModel audioInterface,
    ISettingsRepository settingsRepository,
    Recorder recorder)
    : ObservableBase
{
    public IFilteredReadOnlyObservableCollection<DeviceViewModel> PlaybackDevices { get; } = audioInterface
        .MeasureDevices
        .ToFilteredReadOnlyObservableCollection(x => x.DataFlow == DataFlow.Render);

    [ObservableProperty] private DeviceViewModel? _playbackDevice;

    [ObservableProperty] private bool _isPlaying;

    public ObservableCollection<CalibrationPointViewModel> CalibrationPoints { get; private set; } = [];

    public async Task ActivateAsync()
    {
        this.ObserveProperty(x => x.IsPlaying).Subscribe(PlayingOnUpdated).AddTo(CompositeDisposable);

        await settingsRepository.LoadAsync()
            .ContinueWith(task => task.Result.CalibrationPoints.Select(x => new CalibrationPointViewModel(x)))
            .ContinueWith(task =>
            {
                foreach (var calibrationPointViewModel in task.Result)
                {
                    calibrationPointViewModel.PropertyChanged += CalibrationPointOnPropertyChanged;
                    CalibrationPoints.Add(calibrationPointViewModel);
                }
            });


        PlaybackDevices.CollectionChanged += (_, _) => { PlaybackDevice ??= PlaybackDevices.FirstOrDefault(); };
        PlaybackDevice = PlaybackDevices.FirstOrDefault();
    }

    private async void CalibrationPointOnPropertyChanged(object? sender, PropertyChangedEventArgs e)
    {
        var settings = await settingsRepository.LoadAsync();
        await settingsRepository.SaveAsync(settings with
        {
            CalibrationPoints = CalibrationPoints.Select(x => x.ToCalibrationPoint).ToList()
        });
    }

    private void PlayingOnUpdated(bool playBack)
    {
        if (playBack)
        {
            Start();
        }
        else
        {
            Stop();
        }

    }

    private CancellationTokenSource CancellationTokenSource { get; set; } = new();

    private void Start()
    {
        if (PlaybackDevice is null)
        {
            IsPlaying = false;
            return;
        }

        CancellationTokenSource = new();
        PlaybackDevice.Device.PlayLooping(CancellationTokenSource.Token);
    }

    private void Stop()
    {
        CancellationTokenSource.Cancel();
    }

}
