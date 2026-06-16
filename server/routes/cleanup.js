import { Router } from 'express'
import ProductionLock from '../models/ProductionLock.js'
import ShippingList from '../models/ShippingList.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()

function deduplicateDates(str) {
  if (!str) return ''
  const dates = str.split(',').map(d => d.trim()).filter(Boolean)
  return [...new Set(dates)].join(', ')
}

router.post('/dedup-locks', authMiddleware, async (req, res) => {
  try {
    const locks = await ProductionLock.find({})
    let totalRemoved = 0
    let totalLocks = 0
    for (const lock of locks) {
      const seen = new Set()
      const deduped = []
      for (const item of lock.items) {
        const key = item.containerNo
        if (!seen.has(key)) {
          seen.add(key)
          deduped.push(item)
        } else {
          totalRemoved++
        }
      }
      if (deduped.length !== lock.items.length) {
        lock.items = deduped
        await lock.save()
        totalLocks++
      }
    }
    res.json({ message: `Đã dọn ${totalLocks} lock, xóa ${totalRemoved} item trùng` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

router.post('/dedup-shipping-dates', authMiddleware, async (req, res) => {
  try {
    const lists = await ShippingList.find({})
    let totalItems = 0
    let totalLists = 0
    for (const list of lists) {
      let changed = false
      for (const item of list.items) {
        const oldDsc = item.dsc
        const oldCho = item.choHtxnDvs
        const oldSc = item.sc
        const oldVs = item.vsDvs
        const oldXuLi = item.xuLiLai
        item.dsc = deduplicateDates(item.dsc)
        item.choHtxnDvs = deduplicateDates(item.choHtxnDvs)
        item.sc = deduplicateDates(item.sc)
        item.vsDvs = deduplicateDates(item.vsDvs)
        item.xuLiLai = deduplicateDates(item.xuLiLai)
        if (item.dsc !== oldDsc || item.choHtxnDvs !== oldCho || item.sc !== oldSc || item.vsDvs !== oldVs || item.xuLiLai !== oldXuLi) {
          totalItems++
          changed = true
        }
      }
      if (changed) {
        await list.save()
        totalLists++
      }
    }
    res.json({ message: `Đã dọn ${totalLists} shipping list, sửa ${totalItems} item` })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
})

export default router
