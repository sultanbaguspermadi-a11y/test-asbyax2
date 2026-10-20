export const PLAYER = { 1: 'الأول', 2: 'الثاني' }
export const playerName = p => `اللاعب ${PLAYER[p]}`

export const ERRORS = {
  none: 'ضع قطعة واحدة على الأقل.',
  center: 'في الحركة الأولى يجب أن تمرّ الكلمة بالنجمة في وسط اللوح.',
  line: 'يجب أن تكون القطع في صف واحد أو في عمود واحد.',
  gap: 'لا يجوز ترك فجوات بين القطع الجديدة.',
  disconnected: 'يجب أن تلامس الحركة قطعة موجودة على اللوح.',
  noword: 'يجب أن تتكوّن كلمة من حرفين على الأقل.',
  blank_unset: 'اختر حرفاً للقطعة الفارغة أولاً.',
  ended: 'انتهت اللعبة.',
  occupied: 'هذا المربع مشغول.',
  pending: 'أعد القطع الموضوعة إلى الرف أولاً.',
  bag: 'لا يمكن التبديل: يجب أن يبقى ٧ قطع على الأقل في الكيس.',
  nothing: 'لا توجد حركة سابقة للتراجع عنها.',
}

export const PREMIUM_NAMES = { dl: 'حرف مضاعف', tl: 'حرف ثلاثي', dw: 'كلمة مضاعفة', tw: 'كلمة ثلاثية', star: 'النجمة (كلمة مضاعفة)', plain: 'مربع عادي' }
export const PREMIUM_LABEL = { dl: ['×2', 'حرف'], tl: ['×3', 'حرف'], dw: ['×2', 'كلمة'], tw: ['×3', 'كلمة'] }
export const REASONS = { reason: { time: 'انتهى وقت أحد اللاعبين', rack: 'فرغ رف أحد اللاعبين ولا قطع في الكيس' } }

export const fmtClock = s => { const t = Math.ceil(Math.max(0, s)); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}` }
