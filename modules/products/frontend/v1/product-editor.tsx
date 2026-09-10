import type { ChangeEvent, FormEvent } from 'react';
import type { ProductMarketStatus, ProductType } from '../../contracts';
import type { MasterGroups, ProductForm } from './types';
import { MasterSelect } from './ui';

export function ProductEditor({form,setForm,masters,editing,busy,onSave,onCancel,onImage}:{form:ProductForm;setForm:(form:ProductForm)=>void;masters:MasterGroups;editing:boolean;busy:boolean;onSave:(mode:'draft'|'activate'|'add-another')=>Promise<void>;onCancel:()=>void;onImage:(file:File)=>Promise<void>}){
 const set=<K extends keyof ProductForm>(key:K,value:ProductForm[K])=>setForm({...form,[key]:value});
 return <form className="product-editor" onSubmit={(event:FormEvent)=>{event.preventDefault();void onSave('draft');}}>
  <div className="panel-title"><h2>{editing?'تعديل الصنف':'صنف جديد'}</h2><button type="button" onClick={onCancel}>إلغاء</button></div>
  <fieldset><legend>البيانات الأساسية</legend><div className="grid-form">
   <label>النوع<select value={form.productType} onChange={event=>set('productType',event.target.value as ProductType)}><option value="DRUG">دواء</option><option value="NON_DRUG">غير دواء</option></select></label>
   <label>الاسم الأساسي<input required value={form.displayName} onChange={event=>set('displayName',event.target.value)}/></label>
   <label>العربي<input value={form.arabicName} onChange={event=>set('arabicName',event.target.value)}/></label>
   <label>الإنجليزي<input value={form.englishName} onChange={event=>set('englishName',event.target.value)}/></label>
   <label>الاسم التجاري<input value={form.tradeName} onChange={event=>set('tradeName',event.target.value)}/></label>
   <label>بلد المنشأ<input value={form.countryOfOrigin} onChange={event=>set('countryOfOrigin',event.target.value)}/></label>
   <label className="wide">الوصف<textarea value={form.description} onChange={event=>set('description',event.target.value)}/></label>
  </div></fieldset>
  <fieldset><legend>التصنيف</legend><div className="grid-form">
   <MasterSelect label="التصنيف" value={form.categoryId} items={masters.categories} onChange={value=>set('categoryId',value)}/>
   <MasterSelect label="الشركة المصنعة" value={form.manufacturerId} items={masters.manufacturers} onChange={value=>set('manufacturerId',value)}/>
   <label className="wide">Tags<div className="check-grid">{masters.tags.filter(item=>item.active).map(item=><label className="check" key={item.id}><input type="checkbox" checked={form.tagIds.includes(item.id)} onChange={event=>set('tagIds',event.target.checked?[...form.tagIds,item.id]:form.tagIds.filter(id=>id!==item.id))}/>{item.name}</label>)}</div></label>
  </div></fieldset>
  {form.productType==='DRUG'&&<fieldset><legend>الملف الدوائي</legend><div className="grid-form">
   <MasterSelect label="الشكل الدوائي" value={form.dosageFormId} items={masters.dosageForms} onChange={value=>set('dosageFormId',value)}/>
   <MasterSelect label="طريقة الاستخدام" value={form.routeId} items={masters.routes} onChange={value=>set('routeId',value)}/>
   <label>EDA / Registration<input value={form.regulatoryId} onChange={event=>set('regulatoryId',event.target.value)}/></label>
   <label>ATC<input value={form.atcCode} onChange={event=>set('atcCode',event.target.value)}/></label>
   <label>Prescription<input value={form.prescriptionClass} onChange={event=>set('prescriptionClass',event.target.value)}/></label>
   <label className="check"><input type="checkbox" checked={form.controlled} onChange={event=>set('controlled',event.target.checked)}/>دواء مراقب</label>
   <label className="check"><input type="checkbox" checked={form.coldChain} onChange={event=>set('coldChain',event.target.checked)}/>Cold chain</label>
   <label className="wide">تعليمات التخزين<textarea value={form.storageNotes} onChange={event=>set('storageNotes',event.target.value)}/></label>
  </div><div className="repeat-list"><h3>المواد الفعالة</h3>{form.ingredients.map((row,index)=><div className="repeat-row" key={`${index}-${row.ingredientId}`}>
   <select value={row.ingredientId} onChange={event=>set('ingredients',form.ingredients.map((item,i)=>i===index?{...item,ingredientId:event.target.value}:item))}><option value="">اختر المادة</option>{masters.ingredients.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
   <input placeholder="التركيز" value={row.strengthValue} onChange={event=>set('ingredients',form.ingredients.map((item,i)=>i===index?{...item,strengthValue:event.target.value}:item))}/>
   <input placeholder="mg / ml" value={row.strengthUnit} onChange={event=>set('ingredients',form.ingredients.map((item,i)=>i===index?{...item,strengthUnit:event.target.value}:item))}/>
   <button type="button" disabled={form.ingredients.length===1} onClick={()=>set('ingredients',form.ingredients.filter((_,i)=>i!==index))}>حذف</button>
  </div>)}<button type="button" onClick={()=>set('ingredients',[...form.ingredients,{ingredientId:'',strengthValue:'',strengthUnit:''}])}>+ مادة فعالة</button></div></fieldset>}
  <fieldset><legend>الحالة والبيانات المرجعية</legend><div className="grid-form">
   <label>حالة السوق<select value={form.marketStatus} onChange={event=>set('marketStatus',event.target.value as ProductMarketStatus)}><option value="AVAILABLE">AVAILABLE</option><option value="DISCONTINUED">DISCONTINUED</option><option value="UNKNOWN">UNKNOWN</option></select></label>
   <label>السعر المرجعي<input type="number" min="0" step="0.01" value={form.referencePrice} onChange={event=>set('referencePrice',event.target.value)}/></label>
   <label>مصدر السعر<input value={form.referencePriceSource} onChange={event=>set('referencePriceSource',event.target.value)}/></label>
   <label>تاريخ التحقق<input type="datetime-local" value={form.referencePriceVerifiedAt} onChange={event=>set('referencePriceVerifiedAt',event.target.value)}/></label>
  </div></fieldset>
  {!editing&&<><fieldset><legend>الوحدات والتعبئة</legend><div className="repeat-list">{form.units.map((unit,index)=><div className="repeat-row unit-row" key={index}>
   <input required placeholder="اسم الوحدة" value={unit.name} onChange={event=>set('units',form.units.map((item,i)=>i===index?{...item,name:event.target.value}:item))}/>
   <input placeholder="اختصار" value={unit.shortLabel} onChange={event=>set('units',form.units.map((item,i)=>i===index?{...item,shortLabel:event.target.value}:item))}/>
   <input required type="number" min="0.000001" step="any" value={unit.conversionFactor} onChange={event=>set('units',form.units.map((item,i)=>i===index?{...item,conversionFactor:event.target.value}:item))}/>
   <label className="check"><input type="radio" name="base-unit" checked={unit.isBase} onChange={()=>set('units',form.units.map((item,i)=>({...item,isBase:i===index,conversionFactor:i===index?'1':item.conversionFactor})))}/>أساسية</label>
   <label className="check"><input type="checkbox" checked={unit.defaultSale} onChange={event=>set('units',form.units.map((item,i)=>({...item,defaultSale:i===index?event.target.checked:event.target.checked?false:item.defaultSale})))}/>بيع افتراضي</label>
   <label className="check"><input type="checkbox" checked={unit.defaultPurchase} onChange={event=>set('units',form.units.map((item,i)=>({...item,defaultPurchase:i===index?event.target.checked:event.target.checked?false:item.defaultPurchase})))}/>شراء افتراضي</label>
   <button type="button" disabled={form.units.length===1||unit.isBase} onClick={()=>set('units',form.units.filter((_,i)=>i!==index))}>حذف</button>
  </div>)}<button type="button" onClick={()=>set('units',[...form.units,{name:'',shortLabel:'',conversionFactor:'1',isBase:false,defaultSale:false,defaultPurchase:false,active:true}])}>+ وحدة / عبوة</button></div></fieldset>
  <fieldset><legend>الباركود</legend><div className="repeat-list">{form.barcodes.map((barcode,index)=><div className="repeat-row" key={index}>
   <input value={barcode.value} onChange={event=>set('barcodes',form.barcodes.map((item,i)=>i===index?{...item,value:event.target.value}:item))} placeholder="EAN / UPC"/>
   <select value={barcode.unitIndex} onChange={event=>set('barcodes',form.barcodes.map((item,i)=>i===index?{...item,unitIndex:Number(event.target.value)}:item))}>{form.units.map((unit,i)=><option key={i} value={i}>{unit.name||`وحدة ${i+1}`}</option>)}</select>
   <input value={barcode.symbology} onChange={event=>set('barcodes',form.barcodes.map((item,i)=>i===index?{...item,symbology:event.target.value}:item))} placeholder="EAN-13"/>
   <label className="check"><input type="radio" name="primary-barcode" checked={barcode.isPrimary} onChange={()=>set('barcodes',form.barcodes.map((item,i)=>({...item,isPrimary:i===index})))}/>أساسي</label>
   <button type="button" onClick={()=>set('barcodes',form.barcodes.filter((_,i)=>i!==index))}>حذف</button>
  </div>)}<button type="button" onClick={()=>set('barcodes',[...form.barcodes,{value:'',symbology:'EAN-13',unitIndex:0,isPrimary:form.barcodes.length===0,active:true,source:'manual'}])}>+ باركود</button></div></fieldset></>}
  <fieldset><legend>الصورة</legend><div className="image-editor"><label>رفع صورة<input type="file" accept="image/*" onChange={(event:ChangeEvent<HTMLInputElement>)=>{const file=event.target.files?.[0];if(file)void onImage(file);}}/></label><label>File ID<input value={form.imageFileId} onChange={event=>set('imageFileId',event.target.value)} placeholder="UUID"/></label>{form.imageFileId&&<button type="button" onClick={()=>set('imageFileId','')}>إزالة الصورة</button>}</div></fieldset>
  <fieldset><legend>الملاحظات</legend><textarea value={form.notes} onChange={event=>set('notes',event.target.value)}/></fieldset>
  <div className="sticky-actions"><button type="submit" disabled={busy}>{editing?'حفظ التعديلات':'حفظ كمسودة'}</button><button className="primary" type="button" disabled={busy} onClick={()=>void onSave('activate')}>حفظ وتفعيل</button>{!editing&&<button type="button" disabled={busy} onClick={()=>void onSave('add-another')}>حفظ وإضافة صنف آخر</button>}<button type="button" onClick={onCancel}>إلغاء</button></div>
 </form>;
}
