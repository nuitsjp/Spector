using System.IO;
using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using Reactive.Bindings;

namespace Spector.Model;

public class Recorder
{
    private ISettingsRepository SettingsRepository { get; }
    private Recording? Recording { get; set; }
    private readonly ReactiveCollection<Record> _records = [];
    public ReadOnlyReactiveCollection<Record> Records { get; }
    public DirectoryInfo RootDirectory { get; } = new("Record");


    public Recorder(ISettingsRepository settingsRepository)
    {
        SettingsRepository = settingsRepository;
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

    public void StartRecording(
        DeviceId measureDeviceId,
        Direction direction, 
        bool withVoice, 
        bool withBuzz,
        IEnumerable<IDevice> devices)
    {
        if(Recording is not null) throw new InvalidOperationException("Recording is already started.");

        Recording = new Recording(
            RootDirectory,
            measureDeviceId,
            direction,
            withVoice,
            withBuzz,
            devices);
        Recording.StartRecording();
    }

    public void StopRecording()
    {
        if(Recording is null) throw new InvalidOperationException("Recording is not started.");
        _records.Add(Recording.StopRecording());
        Recording = null;
    }

    public List<Decibel> AnalyzeWaveFile(Record record, Record.RecordByDevice device)
    {
        var levels = new List<Decibel>();

        var file = Path.Combine(RootDirectory.FullName, record.DirectoryName, device.FileName);
        using var reader = new WaveFileReader(file);
        var waveFormat = reader.WaveFormat;
        var aWeightingFilter = new AWeightingFilter(reader.ToSampleProvider());

        var samplesPerWindow = (int)(waveFormat.SampleRate * RecordingConfig.Default.RefreshRate.Interval.TotalSeconds);
        var buffer = new float[samplesPerWindow];

        while (true)
        {
            var samplesRead = aWeightingFilter.Read(buffer, 0, buffer.Length);
            if (samplesRead == 0) break;

            var rms = Math.Sqrt(buffer.Take(samplesRead).Select(s => s * s).Average());
            var db = 20 * Math.Log10(rms);

            var level = Math.Max(db, Decibel.MinimumValue);
            levels.Add((Decibel)level);
        }

        return levels;
    }

    public void DeleteRecord(Record record)
    {
        var directory = new DirectoryInfo(Path.Combine(RootDirectory.FullName, record.DirectoryName));
        if(directory.Exists) directory.Delete(true);
        _records.Remove(record);
    }
}