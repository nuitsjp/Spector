﻿using System.IO;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using NAudio.CoreAudioApi;
using Reactive.Bindings;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Reactive.Bindings.Helpers;
using Spector.Model;

namespace Spector.ViewModel;

public partial class RecorderViewModel(
    AudioInterface audioInterface,
    AudioInterfaceViewModel audioInterfaceViewModel,
    ISettingsRepository settingsRepository)
    : ObservableObject, IDisposable
{
    public CompositeDisposable CompositeDisposable { get; } = new();
    private Recorder Recorder { get; } = new();
    public IReadOnlyCollection<Direction> Directions { get; } = Enum.GetValues<Direction>();
    public IFilteredReadOnlyObservableCollection<IDevice> PlaybackDevices { get; } = audioInterface
        .Devices
        .ToFilteredReadOnlyObservableCollection(x => x.DataFlow == DataFlow.Render);

    [ObservableProperty] private IDevice? _playbackDevice;

    public Direction SelectedDirection { get; set; } = Direction.Front;

    [ObservableProperty] private bool _withVoice;
    [ObservableProperty] private bool _withBuzz;
    [ObservableProperty] private TimeSpan _recordingSpan;
    [ObservableProperty] private bool _isRecording;

    public async Task ActivateAsync()
    {
        var settings = await settingsRepository.LoadAsync();
        RecordingSpan = settings.RecorderSettings.RecordingSpan;
        WithVoice = settings.RecorderSettings.WithVoice;
        WithBuzz = settings.RecorderSettings.WithBuzz;

        PlaybackDevice = PlaybackDevices.FirstOrDefault();


        this.ObserveProperty(x => x.RecordingSpan).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.WithVoice).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.WithBuzz).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
    }

    [RelayCommand]
    private async Task StartRecordingAsync()
    {
        if (IsRecording is false)
        {
            var settings = await settingsRepository.LoadAsync();

            Recorder.StartRecording(
                new DirectoryInfo("Record"),
                audioInterfaceViewModel
                    .Devices
                    .Where(x => x.Measure)
                    .Select(x => x.Device));
        }
        else
        {
            Recorder.StopRecording();
        }

        IsRecording = !IsRecording;
    }

    private async void OnUpdated()
    {
        var settings = await settingsRepository.LoadAsync();
        await settingsRepository.SaveAsync(
            settings with
            {
                RecorderSettings = new RecorderSettings(RecordingSpan, settings.RecorderSettings.OutputDirectory, WithVoice, WithBuzz)
            });
    }

    public void Dispose()
    {
        audioInterface.Dispose();
        CompositeDisposable.Dispose();
    }
}