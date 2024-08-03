using CommunityToolkit.Mvvm.ComponentModel;
using Spector.Model;

namespace Spector.ViewModel.Calibration;

public partial class CalibrationPointViewModel(CalibrationPoint calibrationPoint) : ObservableBase
{
    [ObservableProperty] private double _decibel = calibrationPoint.Decibel.AsPrimitive();
    [ObservableProperty] private double _volumeLevel = calibrationPoint.VolumeLevel.AsPrimitive() * 100;

    /// <summary>
    /// 目安
    /// </summary>
    public string Criterion { get; private set; } = $"{calibrationPoint.Criterion.AsPrimitive()}db";

    /// <summary>
    /// 参考
    /// </summary>
    public string Example { get; private set; } = calibrationPoint.Example;

    /// <summary>
    /// CalibrationPointに変換する
    /// </summary>
    public CalibrationPoint ToCalibrationPoint => new(
        new Decibel(Decibel),
        Example,
        (VolumeLevel)(VolumeLevel / 100),
        (Decibel)Decibel);
}