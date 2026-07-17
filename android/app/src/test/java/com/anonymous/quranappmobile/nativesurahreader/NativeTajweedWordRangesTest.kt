package com.anonymous.quranappmobile.nativesurahreader

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeTajweedWordRangesTest {
  @Test
  fun preservesMultiGlyphWordsAndAttachedMarks() {
    val ranges = buildNativeTajweedWordRanges(listOf("\uF446\uF447", "\uF448", "\uF449\uF44A"), 3)

    assertEquals(
        listOf(
            NativeTajweedWordRange(0, 2, 0),
            NativeTajweedWordRange(2, 3, 1),
            NativeTajweedWordRange(3, 5, 2),
        ),
        ranges,
    )
  }

  @Test
  fun keepsEveryRangeContiguousAcrossPotentialLineBoundaries() {
    val ranges = buildNativeTajweedWordRanges(listOf("a", "bc", "d", "efg"), 4)

    assertEquals(0, ranges.first().start)
    assertEquals(7, ranges.last().end)
    ranges.zipWithNext().forEach { (left, right) -> assertEquals(left.end, right.start) }
  }

  @Test
  fun rejectsIncompleteGlyphToWordMetadata() {
    assertTrue(buildNativeTajweedWordRanges(listOf("a", "b"), 3).isEmpty())
    assertTrue(buildNativeTajweedWordRanges(listOf("a", ""), 2).isEmpty())
  }
}
