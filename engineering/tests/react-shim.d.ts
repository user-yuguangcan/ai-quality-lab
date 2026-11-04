declare module 'react' {
 namespace React {
  class Component<P={},S={}> {constructor(props:P); props:P; state:S; setState(data:Partial<S>|((prev:S)=>Partial<S>),callback?:()=>void):void; render():any;}
  interface FormEvent<T> {preventDefault():void; currentTarget:T;}
  interface ChangeEvent<T> {target:T;}
 }
 export = React;
}
declare module 'react-dom' {export function render(value:any,target:any):void;}
declare namespace JSX {interface Element {} interface IntrinsicElements {[elemName:string]:any;} interface ElementChildrenAttribute {children:{}}}
