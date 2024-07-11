using System.IO;
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
    public CompositeDisposable CompositeDisposable { get; } = new();
    public IFilteredReadOnlyObservableCollection<IDevice> MeasureDevices { get; } = audioInterface
        .Devices
        .ToFilteredReadOnlyObservableCollection(x => x.Measure);
    [ObservableProperty] private IDevice? _measureDevice;

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
        MeasureDevices.CollectionChanged += (_, _) => { MeasureDevice ??= MeasureDevices.FirstOrDefault(); };
        PlaybackDevices.CollectionChanged += (_, _) => { PlaybackDevice ??= PlaybackDevices.FirstOrDefault(); };

        var settings = await settingsRepository.LoadAsync();
        RecordingSpan = settings.RecorderSettings.RecordingSpan;
        WithVoice = settings.RecorderSettings.WithVoice;
        WithBuzz = settings.RecorderSettings.WithBuzz;
        RecorderHost = settings.RecorderHost;


        this.ObserveProperty<RecorderViewModel, TimeSpan>(x => x.RecordingSpan).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty<RecorderViewModel, bool>(x => x.WithVoice).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty<RecorderViewModel, bool>(x => x.WithBuzz).Subscribe(_ => OnUpdated()).AddTo(CompositeDisposable);
        this.ObserveProperty<RecorderViewModel, bool>(x => x.IsPlaying).Subscribe(PlayingOnUpdated).AddTo(CompositeDisposable);
        this.ObserveProperty<RecorderViewModel, string>(x => x.RecorderHost).Subscribe(_ =>
        {
            RemoteHost = RecorderHost;
            OnUpdated();
        }).AddTo(CompositeDisposable);
    }

    [RelayCommand]
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

    private async Task StartRecording()
    {
        var settings = await settingsRepository.LoadAsync();

        recorder.StartRecording(
            new DirectoryInfo("Record"),
            SelectedDirection,
            WithVoice,
            WithBuzz,
            audioInterface.Devices.Where(x => x.Measure));

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

        IsRecording = true;
    }

    private void StopRecording()
    {
        recorder.StopRecording();

        // 進捗更新タイマーを停止する
        UpdateProgressTimer.Stop();

        // 録音タイマーを停止する
        RecordTimer.Stop();

        IsRecording = false;
        RecordingProgress = 0;
    }

    private CancellationTokenSource PlayBackCancellationTokenSource { get; set; } = new();

    private void PlayingOnUpdated(bool playBack)
    {
        if (playBack)
        {
            if (PlaybackDevice is null)
            {
                IsPlaying = false;
                return;
            }

            PlayBackCancellationTokenSource = new();
            PlaybackDevice.PlayLooping(PlayBackCancellationTokenSource.Token);
        }
        else
        {
            PlayBackCancellationTokenSource.Cancel();
        }

    }

    private async void OnUpdated()
    {
        var settings = await settingsRepository.LoadAsync();
        await settingsRepository.SaveAsync(
            settings with
            {
                RecorderHost = RecorderHost,
                RecorderSettings = new RecorderSettings(RecordingSpan, settings.RecorderSettings.OutputDirectory, WithVoice, WithBuzz)
            });
    }

    public void Dispose()
    {
        audioInterface.Dispose();
        CompositeDisposable.Dispose();
    }
}