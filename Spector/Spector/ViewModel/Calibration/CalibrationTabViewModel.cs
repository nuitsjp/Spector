using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using Reactive.Bindings.Extensions;
using Reactive.Bindings.Helpers;
using Spector.Model;
using Spector.Model.IO;
using Spector.View.Measure;
using Spector.ViewModel.Measure;

namespace Spector.ViewModel.Calibration;

public partial class CalibrationTabViewModel(
    AudioInterfaceViewModel audioInterface)
    : ObservableBase
{
    public IFilteredReadOnlyObservableCollection<DeviceViewModel> PlaybackDevices { get; } = audioInterface
        .MeasureDevices
        .ToFilteredReadOnlyObservableCollection(x => x.DataFlow == DataFlow.Render);

    [ObservableProperty] private DeviceViewModel? _playbackDevice;

    [ObservableProperty] private bool _isPlaying;

    public void Activate()
    {
        this.ObserveProperty(x => x.IsPlaying).Subscribe(PlayingOnUpdated).AddTo(CompositeDisposable);

        PlaybackDevices.CollectionChanged += (_, _) => { PlaybackDevice ??= PlaybackDevices.FirstOrDefault(); };
        PlaybackDevice = PlaybackDevices.FirstOrDefault();
    }

    private void PlayingOnUpdated(bool playBack)
    {
        if (playBack)
        {
            StartPlayback();
        }
        else
        {
            StopPlayback();
        }

    }

    private CancellationTokenSource PlayBackCancellationTokenSource { get; set; } = new();

    private void StartPlayback()
    {
        if (PlaybackDevice is null)
        {
            IsPlaying = false;
            return;
        }

        PlayBackCancellationTokenSource = new();
        PlaybackDevice.Device.PlayLooping(PlayBackCancellationTokenSource.Token);
    }

    private void StopPlayback()
    {
        PlayBackCancellationTokenSource.Cancel();
    }

}