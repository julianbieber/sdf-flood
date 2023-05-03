#version 450 
out vec4 out_color;
  
in vec2 uv; // the input variable from the vertex shader (same name and same type)  

void main(){
    out_color = vec4(uv, 1.0, 1.0);
} 