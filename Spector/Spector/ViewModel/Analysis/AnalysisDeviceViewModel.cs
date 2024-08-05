using Spector.Model;

namespace Spector.ViewModel.Analysis;

public class AnalysisDeviceViewModel(
    RecordViewModel audioRecord,
    RecordProcessViewModel recordProcess,
    RecordByDeviceViewModel deviceRecord,
    IReadOnlyList<Decibel> inputLevels)
{
    public RecordViewModel AudioRecord { get; } = audioRecord;
    public RecordByDeviceViewModel DeviceRecord { get; } = deviceRecord;
    public DateTime StartTime => AudioRecord.StartTime;
    public string Device => DeviceRecord.Name;
    public Direction Direction { get; } = recordProcess.Direction;
    public bool WithVoice { get; } = recordProcess.WithVoice;
    public bool WithBuzz { get; } = recordProcess.WithBuzz;
    public VolumeLevel VolumeLevel { get; } = recordProcess.VolumeLevel;
    public Decibel Min => DeviceRecord.Min;
    public Decibel Avg => DeviceRecord.Avg;
    public Decibel Max => DeviceRecord.Max;
    public double Minus30db => DeviceRecord.Minus30db;
    public double Minus40db => DeviceRecord.Minus40db;
    public double Minus50db => DeviceRecord.Minus50db;
    public IReadOnlyList<Decibel> InputLevels { get; } = inputLevels;

    public bool Analysis
    {
        get => DeviceRecord.IsAnalysis;
        set => DeviceRecord.IsAnalysis = value;
    }
}