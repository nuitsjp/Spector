using System.IO;
using System.Text.Json;
using CommunityToolkit.Mvvm.ComponentModel;
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
        IEnumerable<RecordingProcess> recordingProcesses)
    {
        if(Recording is not null) return false;

        var devicesArray = devices.ToArray();

        foreach (var recordingProcess in recordingProcesses)
        {
            Recording = new Recording(
                RootDirectory,
                measureDeviceId,
                recordingProcess.Direction,
                recordingProcess.WithVoice,
                recordingProcess.WithBuzz,
                devicesArray);
            Recording.StartRecording();
        }
        return true;
    }

    public void StopRecording()
    {
        if(Recording is null) throw new InvalidOperationException("Recording is not started.");
        _records.Add(Recording.StopRecording());
        Recording = null;
    }

    public IEnumerable<Decibel> AnalyzeWaveFile(Record record, Record.RecordByDevice device)
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
}

public enum RecordingState
{
    Stopped,
    Ready,
    Recording
}