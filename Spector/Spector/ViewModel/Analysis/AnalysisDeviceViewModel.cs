using Spector.Model;

namespace Spector.ViewModel.Analysis;

public class AnalysisDeviceViewModel(
    RecordViewModel audioRecord,
    RecordByDeviceViewModel deviceRecord)
{
    public RecordViewModel AudioRecord { get; } = audioRecord;
    public RecordByDeviceViewModel DeviceRecord { get; } = deviceRecord;
    public DateTime StartTime => AudioRecord.StartTime;
    public string Device => DeviceRecord.Name;
    public Direction Direction => AudioRecord.Direction;
    public bool WithBuzz => AudioRecord.WithBuzz;
    public bool WithVoice => AudioRecord.WithVoice;
    public Decibel Min => DeviceRecord.Min;
    public Decibel Avg => DeviceRecord.Avg;
    public Decibel Max => DeviceRecord.Max;
    public double Minus30db => DeviceRecord.Minus30db;
    public double Minus40db => DeviceRecord.Minus40db;
    public double Minus50db => DeviceRecord.Minus50db;

    public bool Analysis
    {
        get => DeviceRecord.IsAnalysis;
        set => DeviceRecord.IsAnalysis = value;
    }
}