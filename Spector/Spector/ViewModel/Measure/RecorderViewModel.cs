﻿using System.IO;
using System.Windows.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MaterialDesignThemes.Wpf;
using NAudio.CoreAudioApi;
using Reactive.Bindings.Disposables;
using Reactive.Bindings.Extensions;
using Reactive.Bindings.Helpers;
using Spector.Model;

namespace Spector.ViewModel.Measure;

public partial class RecorderViewModel(
    AudioInterface audioInterface,
    Recorder recorder,
    ISettingsRepository settingsRepository)
    : ObservableObject, IDisposable
{
    public CompositeDisposable CompositeDisposable { get; } = [];
    public IFilteredReadOnlyObservableCollection<IDevice> MeasureDevices { get; } = audioInterface
        .Devices
        .ToFilteredReadOnlyObservableCollection(x => x.Measure);
    [ObservableProperty] private IDevice? _measureDevice;

    public IReadOnlyCollection<Direction> Directions { get; } = Enum.GetValues<Direction>();
    public IFilteredReadOnlyObservableCollection<IDevice> PlaybackDevices { get; } = audioInterface
        .Devices
        .ToFilteredReadOnlyObservableCollection(x => x.DataFlow == DataFlow.Render);

    [ObservableProperty] private IReadOnlyList<RecordingProcessViewModel> _recordingProcesses = [];
    [ObservableProperty] private IDevice? _playbackDevice;

    public Direction SelectedDirection { get; set; } = Direction.R0;

    [ObservableProperty] private bool _withVoice;
    [ObservableProperty] private bool _withBuzz;
    [ObservableProperty] private TimeSpan _recordingSpan;
    [ObservableProperty] private bool _isRecording;
    [ObservableProperty] private PackIconKind _recordingIcon = PackIconKind.Record;

    /// <summary>
    /// 録音開始時刻
    /// </summary>
    private DateTime StartRecordingTime { get; set; }

    /// <summary>
    /// 進捗更新タイマー
    /// </summary>
    private DispatcherTimer UpdateProgressTimer { get; set; } = new();

    /// <summary>
    /// 録音停止タイマー
    /// </summary>
    private DispatcherTimer RecordTimer { get; set; } = new();

    /// <summary>
    /// 録音の進捗を取得する
    /// </summary>
    [ObservableProperty] private int _recordingProgress;

    [ObservableProperty] private bool _isPlaying;

    [ObservableProperty] private string _recorderHost = string.Empty;

    /// <summary>
    /// Staticなのは本当は良くないけどとりあえず・・・
    /// </summary>
    public static string RemoteHost { get; private set; } = string.Empty;

    public async Task ActivateAsync()
    {
        await recorder.ActivateAsync();
        MeasureDevices.CollectionChanged += (_, _) =>
        {
            if (MeasureDevices.Count == 0)
            {
                MeasureDevice = null;
            }
            else
            {
                MeasureDevice ??= MeasureDevices.FirstOrDefault();
            }

            CurrentDispatcher.Dispatcher.Invoke(() =>
            {
                StartRecordingCommand.NotifyCanExecuteChanged();
            });
        };
        PlaybackDevices.CollectionChanged += (_, _) => { PlaybackDevice ??= PlaybackDevices.FirstOrDefault(); };
        PlaybackDevice = PlaybackDevices.FirstOrDefault();

        var settings = await settingsRepository.LoadAsync();
        RecordingSpan = settings.Recorder.RecordingSpan;
        WithVoice = settings.Recorder.WithVoice;
        WithBuzz = settings.Recorder.WithBuzz;
        RecorderHost = settings.RecorderHost;

        var audioCalibrator = new AudioCalibrator(settings.CalibrationPoints);
        RecordingProcesses =
        [
            new RecordingProcessViewModel(new RecordingProcess(Direction.R0, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(50))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R0, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(60))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R0, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(70))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R90, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(50))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R90, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(60))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R90, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(70))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R180, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(50))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R180, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(60))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R180, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(70))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R270, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(50))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R270, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(60))),
            new RecordingProcessViewModel(new RecordingProcess(Direction.R270, false, true, (VolumeLevel)audioCalibrator.EstimateAmplitude(70))),
        ];


        this.ObserveProperty(x => x.RecordingSpan).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.WithVoice).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.WithBuzz).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.IsPlaying).Subscribe(PlayingOnUpdated).AddTo(CompositeDisposable);
        this.ObserveProperty(x => x.RecorderHost).Subscribe(_ =>
        {
            RemoteHost = RecorderHost;
            OnUpdated();
        }).AddTo(CompositeDisposable);
    }

    private bool CanStartRecording() => IsRecording || MeasureDevice is not null;

    [RelayCommand(CanExecute = nameof(CanStartRecording))]
    private async Task StartRecordingAsync()
    {
        if (IsRecording is false)
        {
            await StartRecording();
        }
        else
        {
            StopRecording();
        }
    }

    private CancellationTokenSource RecordingCancellationTokenSource { get; set; } = new();

    private async Task StartRecording()
    {
        await Task.CompletedTask;

        RecordingCancellationTokenSource = new CancellationTokenSource();
        var started = recorder.StartRecording(
            MeasureDevice!.Id,
            audioInterface.Devices.Where(x => x.Measure),
            PlaybackDevice!,
            [
                new RecordingProcess(
                    SelectedDirection,
                    WithVoice,
                    WithBuzz,
                    (VolumeLevel)0.4)
            ],
            RecordingSpan,
            RecordingCancellationTokenSource.Token);
        if(started is false) return;

        // 録音開始時刻を記録する
        StartRecordingTime = DateTime.Now;
        RecordingProgress = 0;

        // 進捗更新タイマーを起動する
        UpdateProgressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
        UpdateProgressTimer.Tick += (_, _) =>
        {
            RecordingProgress = (int)((DateTime.Now - StartRecordingTime).TotalSeconds * 100 / RecordingSpan.TotalSeconds);
        };
        UpdateProgressTimer.Start();

        // 録音タイマーを起動する
        RecordTimer = new DispatcherTimer { Interval = RecordingSpan };
        RecordTimer.Tick += (_, _) => StopRecording();
        RecordTimer.Start();

        if (WithBuzz)
        {
            StartPlayback();
        }

        IsRecording = true;

    }

    private void StopRecording()
    {
        recorder.StopRecording();

        // 進捗更新タイマーを停止する
        UpdateProgressTimer.Stop();

        // 録音タイマーを停止する
        RecordTimer.Stop();
        StopPlayback();

        IsRecording = false;
        RecordingProgress = 0;
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

    private void StartPlayback()
    {
        if (PlaybackDevice is null)
        {
            IsPlaying = false;
            return;
        }

        PlaybackDevice.StartPlayback();
    }

    private void StopPlayback()
    {
        if (PlaybackDevice is null)
        {
            IsPlaying = false;
            return;
        }

        PlaybackDevice.StopPlayback();
    }

    private async void OnUpdated()
    {
        var settings = await settingsRepository.LoadAsync();
        await settingsRepository.SaveAsync(
            settings with
            {
                RecorderHost = RecorderHost,
                Recorder = new Model.Settings.RecorderSettings(RecordingSpan, settings.Recorder.OutputDirectory, WithVoice, WithBuzz)
            });
    }

    public void Dispose()
    {
        audioInterface.Dispose();
        CompositeDisposable.Dispose();
        GC.SuppressFinalize(this);
    }
}