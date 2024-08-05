using CommunityToolkit.Mvvm.ComponentModel;
using System.Windows.Threading;

namespace Spector.Model;

public partial class RecordingProcess(
    Direction direction,
    bool withVoice,
    bool withBuzz,
    VolumeLevel volumeLevel) : ObservableBase
{
    public Direction Direction { get; } = direction;
    public bool WithVoice { get; } = withVoice;
    public bool WithBuzz { get; } = withBuzz;
    public VolumeLevel VolumeLevel { get; } = volumeLevel;

    [ObservableProperty] private RecordingState _state = RecordingState.Stopped;

    public RecordProcess ToRecordProcess(IEnumerable<RecordingByDevice> devices) => 
        new(Direction, WithVoice, WithBuzz, VolumeLevel, devices.Select(x => x.ToRecord()).ToArray());

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

    public void StartRecording(
        TimeSpan recordingSpan, 
        CancellationToken cancellationToken,
        IEnumerable<RecordingByDevice> devices)
    {
        var devicesArray = devices.ToArray();
        foreach (var device in devicesArray)
        {
            device.StartRecording();
        }
        cancellationToken.Register(StopRecording);
        State = RecordingState.Recording;

        // 録音開始時刻を記録する
        StartRecordingTime = DateTime.Now;
        RecordingProgress = 0;

        // 進捗更新タイマーを起動する
        UpdateProgressTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
        UpdateProgressTimer.Tick += (_, _) =>
        {
            RecordingProgress = (int)((DateTime.Now - StartRecordingTime).TotalSeconds * 100 / recordingSpan.TotalSeconds);
        };
        UpdateProgressTimer.Start();

        // 録音タイマーを起動する
        RecordTimer = new DispatcherTimer { Interval = recordingSpan };
        RecordTimer.Tick += (_, _) => StopRecording();
        RecordTimer.Start();
        return;

        void StopRecording()
        {
            RecordTimer.Stop();
            foreach (var device in devicesArray)
            {
                device.StopRecording();
            }
            State = RecordingState.Stopped;
        }
    }
}