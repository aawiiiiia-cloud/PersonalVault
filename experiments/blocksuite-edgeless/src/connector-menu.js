// Replace BlockSuite's shape completion palette with the app's supported cards.
export function customizeConnectorMenu(actions) {
  const Panel=customElements.get('edgeless-auto-complete-panel');
  if(!Panel)return;
  Panel.prototype.render=function(){
    if(actions.readonly())return '';
    const position=this._getPanelPosition();
    if(!position)return '';
    if(!this.pvMenu){
      const menu=document.createElement('div');
      menu.className='pv-connector-menu';menu.setAttribute('role','menu');
      Object.assign(menu.style,{position:'absolute',width:'136px',padding:'6px',boxSizing:'border-box',borderRadius:'8px',background:'var(--pv-connector-menu-bg)',color:'var(--pv-connector-menu-ink)',border:'1px solid var(--pv-connector-menu-border)',boxShadow:'var(--pv-connector-menu-shadow)',zIndex:'1'});
      for(const [type,label] of [['note','文本框'],['table','表格'],['media','插入附件']]){
        const button=document.createElement('button');
        button.type='button';button.textContent=label;button.dataset.connectorCreate=type;button.setAttribute('role','menuitem');
        Object.assign(button.style,{display:'block',width:'100%',height:'32px',padding:'0 10px',textAlign:'left',border:'0',borderRadius:'5px',background:'transparent',color:'inherit',font:'12px sans-serif',cursor:'pointer'});
        button.onpointerenter=()=>button.style.background='var(--pv-connector-menu-hover)';
        button.onpointerleave=()=>button.style.background='transparent';
        button.onclick=event=>{
          event.stopPropagation();
          this._removeOverlay();
          if(actions.readonly()||!this._connectorExist())return;
          actions[type](this);
          this.remove();
        };
        menu.append(button);
      }
      this.pvMenu=menu;
    }
    this.pvMenu.style.left=position[0]+'px';
    this.pvMenu.style.top=position[1]+'px';
    return this.pvMenu;
  };
}
