﻿using CommunityToolkit.Mvvm.ComponentModel;
using NAudio.CoreAudioApi;
using Reactive.Bindings.Extensions;
using Reactive.Bindings.Helpers;
using Spector.Model;
using Spector.Model.IO;
using Spector.View.Measure;
using Spector.ViewModel.Measure;
using Recorder = Spector.Model.Recorder;

namespace Spector.ViewModel.Calibration;

public partial class CalibrationTabViewModel(
    AudioInterfaceViewModel audioInterface,
    Recorder recorder)
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
