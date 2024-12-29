#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout(binding = 2) readonly buffer SliderParameters {
    float v[];
} sliders;

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0

// Parameters for ray marching
const int MAX_STEPS = 128;
const float STEP_SIZE = 0.1;
const float DENSITY_THRESHOLD = 0.1;

const vec3 lightDir = vec3(0.0, -1.0, 1.0);

float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

// Function to generate hash-based pseudo-random numbers
float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.1, 0.1));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}



// Simple noise function
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);

    f = f * f * (3.0 - 2.0 * f); // Smoothstep interpolation

    float n000 = hash(i + vec3(0, 0, 0));
    float n100 = hash(i + vec3(1, 0, 0));
    float n010 = hash(i + vec3(0, 1, 0));
    float n110 = hash(i + vec3(1, 1, 0));
    float n001 = hash(i + vec3(0, 0, 1));
    float n101 = hash(i + vec3(1, 0, 1));
    float n011 = hash(i + vec3(0, 1, 1));
    float n111 = hash(i + vec3(1, 1, 1));

    return mix(
        mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
        mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
        f.z
    );
}

// Fractal Brownian Motion (FBM) for complex noise
float fbm(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < 5; i++) { // Use multiple octaves
        value += amplitude * noise(p * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
    }

    return value;
}

// Density function for the clouds
float densityFunction(vec3 p) {
    return fbm(p * 2000.5); // Adjust scale for desired detail
}



// Henyey-Greenstein phase function
float henyeyGreenstein(float g, float cosTheta) {
    float g2 = g * g;
    return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * cosTheta, 1.5);
}

// Ray marching with advanced light scattering
vec4 rayMarch(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec4 accumulatedColor = vec4(0.0);
    float transmittance = 1.0;

    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 pos = ro + t * rd;
        float density = densityFunction(pos);

        if (density > DENSITY_THRESHOLD) {
            // Compute phase function
            float cosTheta = dot(normalize(lightDir), rd);
            float phase = henyeyGreenstein(0.5, cosTheta); // Adjust 'g' for anisotropy

            // Light intensity based on phase function
            vec3 lightColor = vec3(1.0) * phase;

            // Accumulate color and transmittance
            vec4 sampleColor = vec4(lightColor * density, density);
            accumulatedColor.rgb += sampleColor.rgb * transmittance * sampleColor.a;
            accumulatedColor.a += sampleColor.a * transmittance;

            transmittance *= (1.0 - sampleColor.a);
            if (transmittance < 0.01) break;
        }

        t += STEP_SIZE;
        if (t > 100.0) break;
    }

    return accumulatedColor;
}



// void main() {
//     // Compute normalized device coordinates (NDC)
//     vec2 uv = (gl_FragCoord.xy / vec2(800.0, 600.0)) * 2.0 - 1.0;

//     // Reconstruct ray direction in world space
//     vec4 clipSpacePos = vec4(uv.x, uv.y, -1.0, 1.0);
//     vec4 viewSpacePos = inverse(projectionMatrix) * clipSpacePos;
//     viewSpacePos /= viewSpacePos.w;

//     vec3 rayDir = normalize((inverse(viewMatrix) * viewSpacePos).xyz - cameraPos);

//     // Perform ray marching to render clouds
//     vec4 cloudColor = rayMarch(cameraPos, rayDir);

//     // Apply gamma correction and output final color
//     FragColor = ;
// }

vec4 render(vec3 eye, vec3 ray) {
    vec4 cloudColor = rayMarch(eye, ray);
    return pow(cloudColor, vec4(1.0 / 2.2));
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(0.0, 0.0, -10.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
