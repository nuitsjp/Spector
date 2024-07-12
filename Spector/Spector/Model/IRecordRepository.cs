namespace Spector.Model;

public interface IRecordRepository
{
    Task SaveAsync(Record record);
    Task LoadAsync();
}