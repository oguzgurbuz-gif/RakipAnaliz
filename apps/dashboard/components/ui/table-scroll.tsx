/**
 * FE-12 — Tablo wrapper (yatay scroll + sticky header).
 *
 * Sebep: Birden fazla sayfada raw `<div className="overflow-x-auto">` ile
 * tablolar sarmalanıyordu. Standart bir wrapper hem dar viewport (mobile)
 * davranışını tutarlı kılıyor hem de sticky header opsiyonunu tek noktadan
 * kontrol etmemizi sağlıyor.
 *
 * Kullanım:
 *   <TableScroll minWidth={1100}>
 *     <Table>...</Table>
 *   </TableScroll>
 *
 * Notlar:
 *  - `minWidth` verilmezse Tailwind default `min-w-[800px]` uygulanır;
 *    çoğu masaüstü tablomuz 800–1200 arası, mobile'da overflow tetiklenir.
 *  - `stickyHeader` aktifken iç tablonun `<thead>` içeriğinin sticky kalması
 *    için child `Table`'a `sticky-header` className'i ekleniyor (CSS,
 *    `tailwind.config` extend yok — utility class ile çözüldü).
 *  - `bordered` default true — tablonun "kart" hissini korur.
 */

import * as React from 'react'
import { cn } from '@/lib/utils'

type Props = React.HTMLAttributes<HTMLDivElement> & {
  /** İç tablonun min genişliği (px). Default 800. */
  minWidth?: number | string
  /** Header'ı yapışkan tut (varsayılan: false). */
  stickyHeader?: boolean
  /** Etrafa border + rounded ver (varsayılan: true). */
  bordered?: boolean
  /** Maksimum yükseklik — sticky header için scroll context oluşturur. */
  maxHeight?: number | string
}

export function TableScroll({
  className,
  minWidth = 800,
  stickyHeader = false,
  bordered = true,
  maxHeight,
  children,
  ...rest
}: Props) {
  const minWidthValue = typeof minWidth === 'number' ? `${minWidth}px` : minWidth
  return (
    <div
      className={cn(
        'overflow-x-auto',
        bordered && 'rounded-md border',
        stickyHeader && 'overflow-y-auto',
        className
      )}
      style={{
        ...(maxHeight ? { maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight } : null),
        ...rest.style,
      }}
      {...rest}
    >
      <div
        className={cn(
          'w-full',
          stickyHeader && '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background'
        )}
        style={{ minWidth: minWidthValue }}
      >
        {children}
      </div>
    </div>
  )
}

export default TableScroll
