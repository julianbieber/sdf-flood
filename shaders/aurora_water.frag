#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0


vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) * 
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) * 
        mat3(1.0,0.0,0.0,0.0, cos(roll), -sin(roll),0.0, sin(roll), cos(roll))) * 
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float hash(vec3 p) {
    return fract(dot(sin(p), vec3(1124.0, 1236147.0, 123214.0)));
}

float vnoise(vec3 p) {
    // Get integer coordinates of the cube's origin corner
    vec3 i = floor(p);
    // Get fractional coordinates within the cube
    vec3 f = fract(p);

    // Apply smooth interpolation weights (Hermite curve)
    vec3 u = f * f * (3.0 - 2.0 * f);

    // Get random values for the 8 corners of the cube
    float c000 = hash(i + vec3(0.0, 0.0, 0.0));
    float c100 = hash(i + vec3(1.0, 0.0, 0.0));
    float c010 = hash(i + vec3(0.0, 1.0, 0.0));
    float c110 = hash(i + vec3(1.0, 1.0, 0.0));
    float c001 = hash(i + vec3(0.0, 0.0, 1.0));
    float c101 = hash(i + vec3(1.0, 0.0, 1.0));
    float c011 = hash(i + vec3(0.0, 1.0, 1.0));
    float c111 = hash(i + vec3(1.0, 1.0, 1.0));

    // Perform trilinear interpolation using the smoothed weights 'u'
    float interp_x00 = mix(c000, c100, u.x); // Interpolate along x for bottom-front edge
    float interp_x10 = mix(c010, c110, u.x); // Interpolate along x for bottom-back edge
    float interp_x01 = mix(c001, c101, u.x); // Interpolate along x for top-front edge
    float interp_x11 = mix(c011, c111, u.x); // Interpolate along x for top-back edge

    float interp_y0 = mix(interp_x00, interp_x10, u.y); // Interpolate along y for bottom face
    float interp_y1 = mix(interp_x01, interp_x11, u.y); // Interpolate along y for top face

    float final_interp = mix(interp_y0, interp_y1, u.z); // Interpolate along z between faces

    return final_interp;

}

float fbm( vec3 x, float H ){    
    float t = 0.0;
    for( int i=0; i<3; i++ )
    {
        float f = pow( 2.0, float(i) );
        float a = pow( f, -H );
        t += a*vnoise(f*x);
    }
    return t;
}

float map(vec3 p) {
    vec3 l = rotate(p, 0.0, u.time * 0.2, 0.0);
    float d1 = sphere(l, vec3(0.0), 1.0);
    float d2 = (l.y + 10.0 - fbm(l, 6.5) );

    return min(d1, d2);
}

vec3 normal( in vec3 p ) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps,0);
    return normalize( vec3(map(p+h.xyy) - map(p-h.xyy),
                           map(p+h.yxy) - map(p-h.yxy),
                           map(p+h.yyx) - map(p-h.yyx) ) );
}

void main(){
    vec2 pixel = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 rd = normalize(vec3(pixel, 1.0)); 
    vec3 ro = vec3(0.0, 0.0, -10.0);
    vec3 ref = vec3(0.0);

    float travel = 0.0;
    out_color = vec4(0.0);

    for (int i = 0; i < 100; i = i + 1) {
        vec3 p = ro + rd * travel;
        float d = map(p);
        if (d < 0.001) {
            vec3 n = normal(p);
            float l =max(0.2, dot(n, vec3(10.0, 10.0, 0.0)));
            if (p.y <= -9.7) {
                out_color = vec4(0.0, 0.0, 1.0, 1.0) * l;            
            } else {
                out_color = vec4(1.0) * l;            
            }
            ref = reflect(rd, n);

            break;
        }
        travel += d;
    }

    float t_ref = 0.0;

    for (int i = 0; i < 50; i = i + 1) {
        vec3 p = ro + rd * travel + ref * t_ref; 
        float d = map(p);
        if (d < 0.001) {
            vec3 n = normal(p);
            float l =max(0.2, dot(n, vec3(10.0, 10.0, 0.0)));
            if (p.y <= -9.7) {
                out_color = mix(out_color, vec4(0.0, 0.0, 1.0, 1.0) * l, 0.6);            
            } else {
                out_color = mix(out_color, vec4(1.0) * l, 0.6);            
            }
            ref = reflect(rd, n);

            break;
        }
        t_ref += d;
    }

} 
