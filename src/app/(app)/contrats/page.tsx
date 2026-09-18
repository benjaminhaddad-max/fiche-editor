import { redirect } from 'next/navigation'

/** Les contrats sont désormais avec les bulletins, dans « Mes documents ». */
export default function MesContratsPage() {
  redirect('/documents')
}
