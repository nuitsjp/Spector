namespace Spector;

public static class EnumerableExtension
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
}