import './products.css';
import './v1/products-v1.css';

export { ProductsWorkspace } from './v1/workspace';
export type { ProductsWorkspaceProps } from './v1/workspace';

export function productLayoutForWidth(width:number):'mobile'|'tablet'|'desktop'{
  if(width<720)return'mobile';
  if(width<1100)return'tablet';
  return'desktop';
}
