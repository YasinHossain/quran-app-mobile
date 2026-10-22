package com.anonymous.quranappmobile.nativehomeindex

import org.junit.Assert.assertEquals
import org.junit.Test

class NativeHomeIndexModelsTest {
  @Test
  fun pageItemsAreGeneratedLocallyWithLocalizedDigits() {
    val items = createNativePageIndexItems(
        count = 604,
        titleTemplate = "পৃষ্ঠা __PAGE_NUMBER__",
        digits = "০১২৩৪৫৬৭৮৯",
    )

    assertEquals(604, items.size)
    assertEquals("১", items.first().numberLabel)
    assertEquals("পৃষ্ঠা ১", items.first().title)
    assertEquals("৬০৪", items.last().numberLabel)
    assertEquals("পৃষ্ঠা ৬০৪", items.last().title)
    assertEquals("৬০৪, পৃষ্ঠা ৬০৪", items.last().accessibilityLabel)
  }

  @Test
  fun invalidDigitMapFallsBackToLatinDigits() {
    val item = createNativePageIndexItems(
        count = 12,
        titleTemplate = "Page __PAGE_NUMBER__",
        digits = "",
    ).last()

    assertEquals("12", item.numberLabel)
    assertEquals("Page 12", item.title)
  }

  @Test
  fun negativePageCountProducesNoItems() {
    assertEquals(0, createNativePageIndexItems(-1, "Page __PAGE_NUMBER__", "0123456789").size)
  }
}
