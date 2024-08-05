using System.IO;
using System.Text.Json;
using HarfBuzzSharp;
using Reactive.Bindings;

namespace Spector.Model;

public class Recorder
{
    private Recording? Recording { get; set; }
    private readonly ReactiveCollection<Record> _records = [];
    public ReadOnlyReactiveCollection<Record> Records { get; }
    public DirectoryInfo RootDirectory { get; } = new("Record");


    public Recorder()
    {
        Records = _records.ToReadOnlyReactiveCollection();
    }

    public async Task ActivateAsync()
    {
        RootDirectory.CreateIfNotExists();
        // RootDirectoryの下の拡張子がjsonのファイルをすべて読み込む
        foreach (var file in RootDirectory.GetFiles("*.json", SearchOption.AllDirectories))
        {
            // fileを読み取り、RecordにJSONからデシリアライズする。
            var record = JsonSerializer.Deserialize<Record>(await File.ReadAllTextAsync(file.FullName), JsonEnvironments.Options);
            _records.Add(record!);
        }
    }

    public bool StartRecording(
        DeviceId measureDeviceId,
        IEnumerable<IDevice> devices,
        IDevice playbackDevice,
        IEnumerable<RecordingProcess> recordingProcesses,
        TimeSpan recordingSpan,
        CancellationToken cancellationToken)
    {
        if(Recording is not null) return false;

        // 録音開始時の音量を保存
        var originalVolumeLevel = playbackDevice.VolumeLevel;

        Recording = new Recording(
            RootDirectory,
            measureDeviceId,
            devices.ToArray(),
            recordingProcesses.ToArray(),
            playbackDevice);
        Recording.StartRecording(recordingSpan, cancellationToken);

        // 録音開始時の音量に戻す
        playbackDevice.VolumeLevel = originalVolumeLevel;

        return true;
    }

    public void StopRecording()
    {
        if(Recording is null) throw new InvalidOperationException("Recording is not started.");
        _records.Add(Recording.StopRecording());
        Recording = null;
    }

    public IEnumerable<Decibel> AnalyzeWaveFile(Record record, RecordByDevice device)
    {
        var file = Path.Combine(RootDirectory.FullName, record.DirectoryName, device.FileName);
        return WaveFileAnalyzer.Analyze(file);
    }

    public void DeleteRecord(Record record)
    {
        var directory = new DirectoryInfo(Path.Combine(RootDirectory.FullName, record.DirectoryName));
        if(directory.Exists) directory.Delete(true);
        _records.Remove(record);
    }
}

public enum RecordingState
{
    Stopped,
    Ready,
    Recording
}