using System.IO;
using System.Windows.Threading;
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
    [ObservableProperty] public int _recordingProgress;

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

        Recorder.StartRecording(
            new DirectoryInfo("Record"),
            audioInterfaceViewModel
                .Devices
                .Where(x => x.Measure)
                .Select(x => x.Device));

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
        Recorder.StopRecording();

        // 進捗更新タイマーを停止する
        UpdateProgressTimer.Stop();

        // 録音タイマーを停止する
        RecordTimer.Stop();

        IsRecording = false;
        RecordingProgress = 0;
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