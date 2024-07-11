using CommunityToolkit.Mvvm.ComponentModel;
using Spector.Model;

namespace Spector.ViewModel.Analysis;

public partial class RecordByDeviceViewModel(
    DeviceId id,
    string name,
    string systemName,
    Decibel min,
    Decibel avg,
    Decibel max,
    double minus30db,
    double minus40db,
    double minus50db) : ObservableObject
{
    public DeviceId Id { get; init; } = id;
    public string Name { get; init; } = name;
    public string SystemName { get; init; } = systemName;
    public Decibel Min { get; init; } = min;
    public Decibel Avg { get; init; } = avg;
    public Decibel Max { get; init; } = max;
    public double Minus30db { get; init; } = minus30db;
    public double Minus40db { get; init; } = minus40db;
    public double Minus50db { get; init; } = minus50db;
    [ObservableProperty] private bool _isAnalysis;
}

// Decibelに対するIValueConverter