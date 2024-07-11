namespace Spector.Model;

public record RecordByDevice(
    DeviceId Id,
    string Name,
    string SystemName,
    Decibel Min,
    Decibel Avg,
    Decibel Max,
    double Minus30db,
    double Minus40db,
    double Minus50db);