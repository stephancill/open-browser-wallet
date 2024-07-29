export function replacer(key: string, value: any): any {
  if (value instanceof Uint8Array) {
    return { type: "Uint8Array", data: Array.from(value) };
  } else if (value instanceof ArrayBuffer) {
    return { type: "Uint8Array", data: Array.from(new Uint8Array(value)) };
  }
  return value;
}

export function reviver(key: string, value: any): any {
  if (value && typeof value === "object" && value.type === "Uint8Array") {
    return new Uint8Array(value.data);
  } else if (value && typeof value === "object" && value.type === "ArrayBuffer") {
    return new Uint8Array(value.data).buffer;
  }
  return value;
}
