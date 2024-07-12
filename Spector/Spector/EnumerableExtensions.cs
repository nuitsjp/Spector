namespace Spector;

public static class EnumerableExtensions
{
    /// <summary>
    /// 条件を満たす要素が含まれないことを確認する。
    /// </summary>
    /// <typeparam name="TSource"></typeparam>
    /// <param name="source"></param>
    /// <param name="predicate"></param>
    /// <returns></returns>
    public static bool NotContains<TSource>(this IEnumerable<TSource> source, Func<TSource, bool> predicate)
    {
        return source.Any(predicate) is false;
    }

    public static async Task<List<T>> ToListAsync<T>(this IAsyncEnumerable<T> items)
    {
        var list = new List<T>();
        await foreach (var item in items)
        {
            list.Add(item);
        }
        return list;
    }
}