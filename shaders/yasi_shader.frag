#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv; // the input variable from the vertex shader (same name and same type)
layout (binding  = 0) uniform float time;


#define ZWEIPIE 6.2831853071
#define FOV 100

vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

float noise(vec3 v){
    const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
    const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

    // First corner
    vec3 i  = floor(v + dot(v, C.yyy) );
    vec3 x0 =   v - i + dot(i, C.xxx) ;

    // Other corners
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min( g.xyz, l.zxy );
    vec3 i2 = max( g.xyz, l.zxy );

    //  x0 = x0 - 0. + 0.0 * C
    vec3 x1 = x0 - i1 + 1.0 * C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1. + 3.0 * C.xxx;

    // Permutations
    i = mod(i, 289.0 );
    vec4 p = permute( permute( permute(
                                   i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                               + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
                      + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

    // Gradients
    // ( N*N points uniformly over a square, mapped onto an octahedron.)
    float n_ = 1.0/7.0; // N=7
    vec3  ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4( x.xy, y.xy );
    vec4 b1 = vec4( x.zw, y.zw );

    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

    vec3 p0 = vec3(a0.xy,h.x);
    vec3 p1 = vec3(a0.zw,h.y);
    vec3 p2 = vec3(a1.xy,h.z);
    vec3 p3 = vec3(a1.zw,h.w);

    //Normalise gradients
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    // Mix final noise value
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                  dot(p2,x2), dot(p3,x3) ) );
}

float sphere(vec2 p, vec2 center, float radius) {
    return (radius - length(center - p))/radius;
}

void main(){
    float sunset_time = 1/(1+pow((1.0-abs(sin(0.1*time)))/abs(sin(0.1*time)),3.0));

    float sun_time = 1.0 - sunset_time;

    //background color
    vec4 night_background_color = (1.0-uv.y)*vec4(0.52, 0.35, 0.53,1.0) + uv.y*vec4(0.08, 0.09, 0.32,1.0);
    vec4 day_time_color = (1.0-uv.y) * vec4(0.46, 0.69, 1.0,1.0) + uv.y * vec4(0.53, 0.76, 1.0,1.0);



    // day animation

    vec2 pos = uv;
    float forward = abs(sin(time));
    vec4 day_color = day_time_color ;
    for(float i=5.0;i<8.0;i = i+1.0)
    {
        for(float j=0.0;j<40.0;j = j+10.0){
            forward = abs(sin(0.01*time));
            day_color = day_color+(uv.y)*noise(vec3(i*uv,j*forward))/(15.0);

        }

    }


    vec4 night_color = night_background_color;

    night_color += clamp(sphere(uv, vec2(cos(0.01*time)*0.7-sin(0.01*time)*0.7,cos(0.01*time)*0.7+sin(0.01*time)*0.7), 0.002), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(cos(0.008*time)*0.52-sin(0.008*time)*0.43,cos(0.008*time)*0.52+sin(0.008*time)*0.43), 0.001), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(cos(0.02*time)*0.32-sin(0.02*time)*0.57,cos(0.02*time)*0.32+sin(0.02*time)*0.57), 0.0025), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(0.20,0.49), 0.0012), 0.0,1.0) ;
    night_color += clamp(sphere(uv, vec2(0.1,0.9), 0.0026), 0.0,1.0) ;


    forward = abs(sin(time));
    for(float i=5.0;i<8.0;i = i+1.0)
    {
        for(float j=0.0;j<40.0;j = j+15.0){
            forward = abs(sin(0.01*time));
            night_color = night_color+(uv.y)*noise(vec3(i*uv,j*forward))/(80.0);

        }

    }



    out_color = sunset_time*night_color+sun_time*day_color ;


} 