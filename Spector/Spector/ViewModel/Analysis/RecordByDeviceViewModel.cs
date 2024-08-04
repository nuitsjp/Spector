using CommunityToolkit.Mvvm.ComponentModel;
using Spector.Model;
using static Spector.Model.Record;

namespace Spector.ViewModel.Analysis;

public partial class RecordByDeviceViewModel(
    RecordByDevice device,
    DeviceId id,
    string name,
    string systemName,
    Direction direction,
    bool withVoice,
    bool withBuzz,
    VolumeLevel volumeLevel,
    Decibel min,
    Decibel avg,
    Decibel max,
    double minus30db,
    double minus40db,
    double minus50db) : ObservableObject
{
    public RecordByDevice Device { get; } = device;
    public DeviceId Id { get; init; } = id;
    public string Name { get; init; } = name;
    public string SystemName { get; init; } = systemName;
    public Direction Direction { get; init; } = direction;
    public bool WithVoice { get; init; } = withVoice;
    public bool WithBuzz { get; init; } = withBuzz;
    public VolumeLevel VolumeLevel { get; init; } = volumeLevel;
    public Decibel Min { get; init; } = min;
    public Decibel Avg { get; init; } = avg;
    public Decibel Max { get; init; } = max;
    public double Minus30db { get; init; } = minus30db;
    public double Minus40db { get; init; } = minus40db;
    public double Minus50db { get; init; } = minus50db;
    [ObservableProperty] private bool _isAnalysis;
}